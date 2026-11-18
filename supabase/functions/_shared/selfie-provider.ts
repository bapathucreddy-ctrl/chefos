import { HttpError, secret } from "./http.ts";

export function selfieProviderConfigured(): boolean {
  return Boolean(Deno.env.get("DIDIT_API_KEY"));
}

function threshold(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new HttpError(503, "Selfie verification thresholds need configuration.");
  }
  return value;
}

type FaceImage = { entities?: unknown[] };
type Assessment = {
  status?: string;
  score?: number;
  method?: string;
  user_image?: FaceImage;
  ref_image?: FaceImage;
  warnings?: { log_type?: string }[];
};
type Report = {
  request_id: string;
  vendor_data: string;
  liveness?: Assessment;
  face_match?: Assessment;
};

async function request(path: string, form: FormData): Promise<Report> {
  const response = await fetch(`https://verification.didit.me/v3/${path}/`, {
    method: "POST",
    headers: { "x-api-key": secret("DIDIT_API_KEY") },
    body: form,
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    throw new HttpError(503, "Selfie verification is temporarily unavailable. Please retry.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(502, "The verification provider returned an incomplete result.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 200000) {
      await reader.cancel();
      throw new HttpError(502, "The verification provider returned an invalid result.");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(output));
  } catch {
    throw new HttpError(502, "The verification provider returned an invalid result.");
  }
}

function approved(assessment: Assessment | undefined, minimum: number): boolean {
  return Boolean(
    assessment?.status === "Approved" &&
    typeof assessment.score === "number" &&
    Number.isFinite(assessment.score) &&
    assessment.score > minimum && assessment.score <= 100 &&
    assessment.user_image?.entities?.length === 1 &&
    Array.isArray(assessment.warnings) &&
    !assessment.warnings.some((warning) => warning.log_type === "error"),
  );
}

function validateReport(report: Report, attemptId: string) {
  if (typeof report?.request_id !== "string" || report.request_id.length < 1 ||
    report.request_id.length > 180 || report.vendor_data !== attemptId) {
    throw new HttpError(502, "The verification provider result could not be linked to this selfie.");
  }
}

export async function compareSelfie(attemptId: string, photo: Blob, reference?: Blob) {
  if (!selfieProviderConfigured()) {
    throw new HttpError(503, "Selfie verification is awaiting secure configuration.");
  }
  const livenessMinimum = threshold("CHEFOS_LIVENESS_THRESHOLD", 30);
  const matchMinimum = threshold("CHEFOS_FACE_MATCH_THRESHOLD", 50);
  const liveForm = new FormData();
  liveForm.set("user_image", photo, "selfie.jpg");
  liveForm.set("face_liveness_score_decline_threshold", String(livenessMinimum));
  liveForm.set("save_api_request", "false");
  liveForm.set("vendor_data", attemptId);
  const liveReport = await request("passive-liveness", liveForm);
  validateReport(liveReport, attemptId);
  const liveness = approved(liveReport.liveness, livenessMinimum) && liveReport.liveness?.method === "PASSIVE";
  if (!liveness || !reference) {
    return {
      request_id: liveReport.request_id,
      liveness,
      match: false,
      liveness_score: liveReport.liveness?.score ?? null,
      match_score: null,
    };
  }
  const matchForm = new FormData();
  matchForm.set("user_image", photo, "selfie.jpg");
  matchForm.set("ref_image", reference, "registration.jpg");
  matchForm.set("face_match_score_decline_threshold", String(matchMinimum));
  matchForm.set("save_api_request", "false");
  matchForm.set("vendor_data", attemptId);
  const matchReport = await request("face-match", matchForm);
  validateReport(matchReport, attemptId);
  const match = approved(matchReport.face_match, matchMinimum) && matchReport.face_match?.ref_image?.entities?.length === 1;
  return {
    request_id: matchReport.request_id,
    liveness,
    match,
    liveness_score: liveReport.liveness?.score ?? null,
    match_score: matchReport.face_match?.score ?? null,
  };
}
