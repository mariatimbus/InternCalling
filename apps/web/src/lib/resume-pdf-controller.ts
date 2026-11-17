import { isResumeMetadata, safeResumeAccess, validateResumeSelection, ResumePdfConflict, type ResumeAccess, type ResumeMetadata, type ResumePdfService } from "./resume-pdf";
export type ResumePdfState = {
  status: "unconnected" | "loading" | "ready" | "unavailable";
  confirmed: ResumeMetadata | null; selected: File | null; warning: string;
  busy: "upload" | "cancelling" | "remove" | "access" | null;
  progress: number | null; error: string; notice: string; deleting: boolean;
  access: { value: ResumeAccess; intent: "view" | "download" } | null;
};
export const initialResumePdfState = (connected: boolean): ResumePdfState => ({ status: connected ? "loading" : "unconnected", confirmed: null, selected: null, warning: "", busy: null, progress: null, error: "", notice: "", deleting: false, access: null });
/** Owns async operation lifetimes, never local object URLs or file persistence. */
export class ResumePdfController {
  state: ResumePdfState;
  private listeners = new Set<(state: ResumePdfState) => void>();
  private disposed = false;
  private active: AbortController | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  constructor(private service?: ResumePdfService, private preview = false) { this.state = initialResumePdfState(!!service); }
  subscribe(listener: (state: ResumePdfState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private update(value: Partial<ResumePdfState>) { if (!this.disposed) { this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener(this.state)); } }
  private releaseAccess() {
    if (this.expiry) clearTimeout(this.expiry); this.expiry = null;
    const access = this.state.access?.value;
    if (access?.kind === "local-preview") access.release();
    this.update({ access: null });
  }
  async load() {
    if (this.disposed || this.state.busy || this.active) return;
    if (!this.service) { this.update(initialResumePdfState(false)); return; }
    this.update({ error: "", notice: "" }); await this.refresh();
  }
  private async refresh() {
    if (!this.service || this.disposed) return;
    this.releaseAccess(); this.update({ status: "loading" });
    const operation = new AbortController(); this.active = operation;
    try {
      const confirmed = await this.service.load({ signal: operation.signal });
      if (this.disposed || operation.signal.aborted) return;
      if (confirmed !== null && !isResumeMetadata(confirmed)) throw new Error("Invalid metadata");
      this.update({ confirmed, status: "ready" });
    } catch { if (!this.disposed) this.update({ status: "unavailable", error: "Resume status could not be loaded. Retry before uploading or changing the saved resume." }); }
    finally { if (this.active === operation) this.active = null; }
  }
  select(files: readonly File[]) {
    if (this.disposed || this.state.busy || !files.length) return;
    const result = validateResumeSelection(files);
    this.update({ selected: result.file ?? null, warning: result.warning ?? "", error: result.error ?? "", notice: "", progress: null });
  }
  clearSelection() { if (!this.state.busy) this.update({ selected: null, warning: "", error: "", notice: "", progress: null }); }
  requestDelete() { if (this.state.status === "ready" && this.state.confirmed && !this.state.busy) this.update({ deleting: true, error: "", notice: "" }); }
  keepResume() { if (!this.state.busy) this.update({ deleting: false, error: "" }); }
  cancelUpload() {
    if (this.state.busy !== "upload") return;
    this.update({ busy: "cancelling", progress: null, notice: "Stopping the request. Checking the current resume before another attempt." });
    this.active?.abort();
  }
  async upload() {
    const { selected, confirmed } = this.state;
    if (this.disposed || !this.service || this.state.status !== "ready" || this.state.busy || this.active || !selected || this.state.deleting) return;
    const operation = new AbortController(); this.active = operation;
    this.update({ busy: "upload", error: "", notice: "", progress: null });
    try {
      const result = await this.service.upload(selected, { replace: confirmed ? { id: confirmed.id, revision: confirmed.revision } : null, signal: operation.signal, onProgress: progress => {
        if (this.disposed || operation.signal.aborted || this.active !== operation) return;
        const { transferredBytes, totalBytes } = progress;
        if (!Number.isFinite(transferredBytes) || !Number.isFinite(totalBytes) || transferredBytes < 0 || totalBytes <= 0 || transferredBytes > totalBytes) { this.update({ progress: null }); return; }
        this.update({ progress: Math.floor(transferredBytes / totalBytes * 100) });
      } });
      if (this.disposed) return;
      if (operation.signal.aborted) {
        await this.refresh(); this.update({ notice: "Request stopped. The current resume status is shown below." });
      } else {
        if (!isResumeMetadata(result)) throw new Error("Invalid metadata");
        this.releaseAccess(); this.update({ confirmed: result, selected: null, warning: "", notice: this.preview ? "Simulated PDF upload confirmed." : "Resume PDF uploaded." });
      }
    } catch (cause) {
      if (this.disposed) return;
      const cancelled = operation.signal.aborted;
      this.update({ error: cancelled ? "" : cause instanceof ResumePdfConflict ? "The saved resume changed elsewhere. Current metadata will be refreshed; review it before retrying." : "The upload could not be confirmed. Your selected file and previous confirmed resume are retained until status is refreshed." });
      await this.refresh();
      if (cancelled) this.update({ notice: "Request stopped. The current resume status is shown below." });
    } finally {
      if (this.active === operation) this.active = null;
      this.update({ busy: null, progress: null });
    }
  }
  async remove() {
    const confirmed = this.state.confirmed;
    if (this.disposed || !this.service || !confirmed || this.state.status !== "ready" || !this.state.deleting || this.state.busy || this.active) return;
    const operation = new AbortController(); this.active = operation;
    this.update({ busy: "remove", error: "", notice: "" });
    try {
      await this.service.remove({ id: confirmed.id, revision: confirmed.revision }, { signal: operation.signal });
      if (this.disposed) return;
      this.releaseAccess(); this.update({ confirmed: null, deleting: false, notice: this.preview ? "Simulated PDF deletion confirmed." : "Resume PDF removed." });
    } catch (cause) {
      if (!this.disposed) { this.update({ error: cause instanceof ResumePdfConflict ? "The saved resume changed elsewhere. Current metadata will be refreshed; review it before deleting." : "Deletion could not be confirmed. The previous resume remains shown until status is refreshed." }); await this.refresh(); this.update({ deleting: false }); }
    } finally { if (this.active === operation) this.active = null; this.update({ busy: null }); }
  }
  async open(intent: "view" | "download") {
    const confirmed = this.state.confirmed;
    if (this.disposed || !this.service || !confirmed || this.state.status !== "ready" || this.state.busy || this.active) return;
    const operation = new AbortController(); this.active = operation;
    this.releaseAccess(); this.update({ busy: "access", error: "", notice: "" });
    let value: ResumeAccess | undefined;
    try {
      value = await this.service.access({ id: confirmed.id, revision: confirmed.revision }, { intent, signal: operation.signal });
      if (this.disposed || operation.signal.aborted) { if (value.kind === "local-preview") value.release(); return; }
      if (!safeResumeAccess(value, this.preview)) { if (value.kind === "local-preview") value.release(); throw new Error("Unsafe access URL"); }
      this.update({ access: { value, intent } });
      if (value.kind === "authorized") this.expiry = setTimeout(() => { this.releaseAccess(); this.update({ notice: "The access link expired. Request a new link to open the PDF." }); }, Math.min(Date.parse(value.expiresAt) - Date.now(), 2147483647));
    } catch { if (!this.disposed) this.update({ error: "A safe access link could not be obtained. Retry View PDF or Download PDF." }); }
    finally { if (this.active === operation) this.active = null; this.update({ busy: null }); }
  }
  dispose() {
    this.releaseAccess(); this.disposed = true; this.active?.abort(); this.active = null; this.listeners.clear();
  }
}
