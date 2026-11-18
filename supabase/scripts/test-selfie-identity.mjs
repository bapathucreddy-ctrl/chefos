import assert from 'node:assert/strict';

// Synthetic provider results are submitted only by the disposable database
// owner. Public clients never have this permission in the application.
export async function testSelfieIdentity(db, actor, rpc, chefUser, chef, customer, session, admin) {
  const begin = (who, visit = null, consent = true) => actor(who, () =>
    rpc('chefos_selfie_begin', ['$1', '$2'], [visit, consent]));
  const claim = (who, id, hash) => rpc('chefos_selfie_claim', ['$1', '$2', '$3'], [who, id, hash]);
  const finish = (id, token, result) => rpc('chefos_selfie_finish', ['$1', '$2', '$3', '$4'], [chefUser, id, token, result]);
  const result = (id, liveness = true, match = true) => ({ request_id: id, liveness, match, liveness_score: 95, match_score: 99 });

  await assert.rejects(() => begin(customer), /Chef account/i);
  await assert.rejects(() => begin(chefUser, null, false), /consent/i);
  await actor(chefUser, () => assert.rejects(() => rpc('chefos_mobile_action', ["'partner.availability'", '$1'], [{ is_available: true }]), /registration selfie/i));
  await db.query('update chefos_chefs set is_verified=false,is_available=false where id=$1', [chef]);
  await actor(admin, () => assert.rejects(() => rpc('chefos_ops_update', ["'chefs'", '$1', '$2'], [chef, { is_verified: true }]), /registration selfie/i));
  const enrolment = await begin(chefUser);
  assert(!JSON.stringify(enrolment).includes('object_key'));
  const enrolClaim = await claim(chefUser, enrolment.id, 'c'.repeat(64));
  await assert.rejects(() => claim(chefUser, enrolment.id, 'c'.repeat(64)), /being verified/i);
  await actor(chefUser, () => assert.rejects(() => rpc('chefos_selfie_finish', ['$1', '$2', '$3', '$4'],
    [chefUser, enrolment.id, enrolClaim.claim_token, result('cannot-fake-client')]), /permission denied/i));
  await assert.rejects(() => finish(enrolment.id, '00000000-0000-0000-0000-000000000000', result('wrong-token')), /lease/i);
  assert.equal((await finish(enrolment.id, enrolClaim.claim_token, result('selfie-registration'))).state, 'passed');
  const status = await actor(chefUser, () => rpc('chefos_identity_status'));
  assert.equal(status.enrolled, true);
  assert.equal((await db.query('select is_verified from chefos_chefs where id=$1', [chef])).rows[0].is_verified, false);
  await actor(admin, () => rpc('chefos_ops_update', ["'chefs'", '$1', '$2'], [chef, { is_verified: true }]));
  assert(!JSON.stringify(status).includes('object_key'));
  assert.equal((await finish(enrolment.id, enrolClaim.claim_token, result('selfie-registration'))).state, 'passed');
  await assert.rejects(() => begin(chefUser), /already enrolled/i);
  await actor(chefUser, () => rpc('chefos_mobile_action', ["'partner.availability'", '$1'], [{ is_available: true }]));

  const replay = await begin(chefUser, session);
  await assert.rejects(() => claim(chefUser, replay.id, 'c'.repeat(64)), /fresh camera/i);
  await assert.rejects(() => claim(customer, replay.id, 'd'.repeat(64)), /Assigned active chef/i);
  const spoof = await begin(chefUser, session);
  const spoofClaim = await claim(chefUser, spoof.id, 'd'.repeat(64));
  assert.equal((await finish(spoof.id, spoofClaim.claim_token, result('selfie-spoof', false, true))).state, 'failed');
  const mismatch = await begin(chefUser, session);
  const mismatchClaim = await claim(chefUser, mismatch.id, 'e'.repeat(64));
  assert.equal((await finish(mismatch.id, mismatchClaim.claim_token, result('selfie-mismatch', true, false))).state, 'failed');
  const live = await begin(chefUser, session);
  const liveClaim = await claim(chefUser, live.id, 'f'.repeat(64));
  assert.equal(liveClaim.reference_id, enrolment.id);
  assert.equal(liveClaim.reference_hash, 'c'.repeat(64));
  assert.equal((await finish(live.id, liveClaim.claim_token, result('selfie-live'))).state, 'passed');
  assert.equal((await db.query('select state from chefos_private.face_checks where id=$1', [live.id])).rows[0].state, 'passed');
  await actor(chefUser, () => assert.rejects(() => db.query('select * from chefos_private.chef_selfies'), /permission denied/i));
  const cleanup = await rpc('chefos_selfie_cleanup');
  assert(cleanup.some((entry) => entry.id === live.id));
  assert.equal(cleanup.find((entry) => entry.id === enrolment.id).orphan_reference, null);
  assert.equal((await db.query('select count(*)::int n from chefos_private.chef_selfies where chef_id=$1', [chef])).rows[0].n, 1);
  console.log('PASS: registration consent; immutable private selfie; service-only proof; exclusive leases; replay rejection; liveness/match failures; per-visit identity binding; safe cleanup');
}
