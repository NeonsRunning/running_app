/**
 * Focused flows — registration, publishing, race-day check-in. These take over
 * the screen: no site header, no footer, no bottom tab bar competing with the
 * one action the runner or organizer came here to complete.
 */
export default function FlowLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <div className="min-h-dvh bg-ink">
      <div id="main">{children}</div>
    </div>
  );
}
