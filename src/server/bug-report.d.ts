/**
 * Types for bug-report.js. Hand-written, for the same reason http.d.ts and
 * scoreboard.d.ts are: the file beside it is plain JS the container runs with
 * bare `node`, and vite.config.ts and the colocated test import it from
 * TypeScript.
 */

/** One report, as the sender receives it. Every optional field is '' when absent. */
export type BugReport = {
  description: string
  email: string
  version: string
  /** Whoever the edge decided the caller was; the rate-limit key, and nothing more. */
  client: string
  /** When the server took it, in epoch milliseconds. */
  at: number
}

/** True if the report was accepted by the provider; false — never a throw — otherwise. */
export type SendMail = (report: BugReport) => Promise<boolean>

/** True if the token was solved for this site; false — never a throw — otherwise. */
export type VerifyCaptcha = (token: string, client: string) => Promise<boolean>

export type BugReportHandlerOptions = {
  sendMail?: SendMail | null
  verifyCaptcha?: VerifyCaptcha | null
  /** The public half of the Turnstile pair; '' means the feature is off. */
  siteKey?: string
  now?: () => number
}

export type BugReportRequest = {
  method?: string
  pathname?: string
  body?: string
  client?: string
  now?: number
}

export type BugReportAnswer = {
  status: number
  json: Record<string, unknown>
}

export type BugReportHandler = (request: BugReportRequest) => Promise<BugReportAnswer>

export type BugReportEnv = Record<string, string | undefined>

export declare const BUG_REPORT_PREFIX: string
export declare const BUG_REPORT_MAX_BODY_BYTES: number
export declare const MAX_DESCRIPTION_LENGTH: number
export declare const MAX_EMAIL_LENGTH: number
export declare const MAX_TOKEN_LENGTH: number
export declare const MAX_VERSION_LENGTH: number
export declare const REPORT_LIMIT: { limit: number; windowMs: number }
export declare const GLOBAL_LIMIT: { limit: number; windowMs: number }
export declare const MAX_LIMIT_BUCKETS: number
export declare const TURNSTILE_VERIFY_URL: string
export declare const MAILGUN_API_BASE: string

export declare const parseReport: (raw: unknown) => Omit<BugReport, 'client' | 'at'> & { token: string } | null
export declare const createBugReportHandler: (options?: BugReportHandlerOptions) => BugReportHandler
export declare const createTurnstileVerifier: (env?: BugReportEnv, fetchImpl?: typeof fetch) => VerifyCaptcha | null
export declare const createMailgunSender: (env?: BugReportEnv, fetchImpl?: typeof fetch) => SendMail | null
