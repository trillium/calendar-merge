import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen w-screen text-black bg-gradient-to-br from-indigo-400 to-purple-600">
        <div className="h-screen w-screen flex">
          <nav></nav>
          <main className="flex flex-1 items-center justify-center">
            {children}
          </main>
          <footer></footer>
        </div>
      </body>
    </html>
  );
}
