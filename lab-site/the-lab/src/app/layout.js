import { auth } from "../../auth";
import Providers from "./providers";
import InstallPrompt from "./components/InstallPrompt";
import "./globals.css";

export const viewport = {
    themeColor: "#000000",
    width: "device-width",
    initialScale: 1,
    // Do NOT set maximumScale/userScalable — blocking pinch-zoom fails WCAG 2.2 SC 1.4.4 (Resize
    // Text) / 1.4.10 (Reflow). Users must be able to zoom (AC-8b).
    // PWA runs display:standalone (fullscreen) — opt into the safe-area insets so
    // top chrome can pad below the status bar/notch instead of being clipped.
    viewportFit: "cover",
};

export const metadata = {
    title: "The Lab | Fort Smith's Premier Hackerspace & Makerspace",
    description: "Join the most active hackerspace in the River Valley. Access 3D printers, laser cutters, and a community of creators in Fort Smith, AR. Learn, build, and collaborate.",
    keywords: ["Hackerspace", "Maker Space", "Fort Smith", "Arkansas", "FabLab", "3D Printing", "Community", "DIY", "River Valley", "Workshops", "Coworking"],
    authors: [{ name: "The Lab Community" }],
    openGraph: {
        title: "The Lab - Create, Collaborate, Innovate in Fort Smith",
        description: "More than just tools. We are a community of hackers, makers, learners, and doers in Fort Smith, AR. Join us today.",
        url: "https://thelab.critter.codes", // Replace with actual domain if different
        siteName: "The Lab",
        locale: "en_US",
        type: "website",
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default async function RootLayout({ children }) {
    const session = await auth();

    return (
        <html lang="en">
            <body>
                <Providers session={session}>
                    {children}
                    <InstallPrompt />
                </Providers>
            </body>
        </html>
    );
}
