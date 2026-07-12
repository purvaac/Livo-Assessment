export const metadata = {
  title: "Pronunciation Assessor",
  description: "Upload English speech and get a pronunciation score with word-level feedback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#0f1115", color: "#e8e8ea" }}>
        {children}
      </body>
    </html>
  );
}
