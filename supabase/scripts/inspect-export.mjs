// Read-only preflight: never opens a network connection or changes either DB.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [source,destination]=process.argv.slice(2);
if(!source || !destination)throw new Error('Usage: node scripts/inspect-export.mjs EXPORT.json REPORT.json');
const raw=await readFile(source),payload=JSON.parse(raw);
if(payload.format!=='chefos-django-export-v1')throw new Error('Unsupported export format');
const records=payload.records,issues=[];
const users=records['users.User'] || [],partners=records['chef.ChefPartnerProfile'] || [];
const emails=new Map(),names=new Set();
for(const user of users){
 const email=user.email?.trim().toLowerCase();
 if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))issues.push({kind:'missing_valid_email',legacy_user_id:user.id});
 else{const old=emails.get(email);if(old)issues.push({kind:'duplicate_email',legacy_user_ids:[old,user.id]});else emails.set(email,user.id)}
 const username=user.username?.trim().toLowerCase();if(names.has(username))issues.push({kind:'duplicate_username',legacy_user_id:user.id});names.add(username);
 if(user.is_staff || user.is_superuser)issues.push({kind:'admin_role_requires_explicit_mapping',legacy_user_id:user.id});
}
const active=new Set();
for(const plan of records['core.Subscription'] || []){
 if(!plan.chef_id)issues.push({kind:'subscription_missing_chef',legacy_subscription_id:plan.id});
 if(!plan.pricing_snapshot || !Object.keys(plan.pricing_snapshot).length)issues.push({kind:'legacy_price_requires_locked_snapshot',legacy_subscription_id:plan.id,stored_price:plan.price});
 if(plan.is_active){if(active.has(plan.user_id))issues.push({kind:'multiple_active_plans',legacy_user_id:plan.user_id});active.add(plan.user_id)}
}
for(const request of records['chef.InstantChefRequest'] || [])if(['searching','accepted'].includes(request.status))issues.push({kind:'inflight_instant_request_requires_cutover_resolution',legacy_request_id:request.id});
for(const session of records['chef.ServiceOtpSession'] || [])if(session.status!=='completed')issues.push({kind:'inflight_service_requires_cutover_resolution',legacy_session_id:session.id});
const report={project_ref:'gvkzgipicojtlzwdnthk',source_sha256:createHash('sha256').update(raw).digest('hex'),counts:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.length])),
 identity_mapping_required:users.map(u=>({legacy_user_id:u.id,role:partners.some(p=>p.user_id===u.id)?'chef':'customer',supabase_user_id:null})),
 issues,password_migration:'Django password hashes are not imported. Resolve verified Auth identity mappings and password recovery before cutover.',ready_for_cutover:false};
await writeFile(destination,JSON.stringify(report,null,2),{flag:'wx'});
console.log(`Preflight written: ${users.length} identities; ${issues.length} review items. No remote data changed.`);
