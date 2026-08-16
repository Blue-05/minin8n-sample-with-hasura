import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../lib/nhost/AuthProvider";
import Navigation from "../components/Navigation";

export const metadata: Metadata = { title: "AgentFlow", description: "AI Agent Workflow Builder" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en">
    <body>
      <AuthProvider>
        <div className="shell">
          <Navigation />{children}
        </div>
      </AuthProvider>
    </body>
  </html>;
}
