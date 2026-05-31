import { AlertCircle } from "lucide-react";

export default function FooterDisclaimer() {
  return (
    <footer className="mt-12 pt-8 border-t border-slate-800/50">
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-amber-400 mb-1 uppercase tracking-wider">Disclaimer</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              This platform is a{" "}
              <strong className="text-slate-300">situational awareness tool only</strong>. It does
              not support military targeting or operational planning. Events are algorithmically
              extracted and scored; high-impact events require human editorial review before
              publication. All data is derived from open-source intelligence and may contain
              inaccuracies.
            </p>
          </div>
        </div>
      </div>
      <div className="text-center text-xs text-slate-600">
        <p>The Sentinel Review &mdash; Washington, D.C.</p>
        <p className="mt-1">contact@thesentinelreview.com &middot; thesentinelreview.com</p>
      </div>
    </footer>
  );
}
