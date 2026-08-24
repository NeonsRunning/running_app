export default function AuthLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <div id="main" className="bg-ink">
      {children}
    </div>
  );
}
