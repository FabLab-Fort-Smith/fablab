import HeroSection from './components/landing/hero';
import AboutUsSection from './components/landing/about';
import MembershipHighlights from './components/landing/membership';
import CommunityPulse from './components/landing/CommunityPulse';
// import Services from './components/landing/services';
import ContactSection from './components/landing/contact';
import Footer from './components/layout/footer';

export default function Home() {
  return (
    <div>
      <HeroSection />
      <CommunityPulse />
      <AboutUsSection />
      <MembershipHighlights />
      {/* <Services /> */}
      <ContactSection />
      <Footer />
    </div>
  );
}
