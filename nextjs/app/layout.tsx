import "./globals.css";
import Navigation from "./features/Navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen w-screen text-black bg-linear-to-br from-indigo-400 to-purple-600">
        <div className="h-screen w-screen flex flex-col">
          <Navigation />
          <main className="flex flex-1 items-center justify-center">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
