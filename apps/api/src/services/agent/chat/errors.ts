export class ResumeError extends Error {
  constructor(
    readonly code: "no-such-run" | "no-matching-pause",
    message: string,
  ) {
    super(message);
    this.name = "ResumeError";
  }
}
