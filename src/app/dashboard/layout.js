import { auth } from "../../../auth";
import LabShell from "../components/layout/LabShell";

export default async function DashboardLayout({ children }) {
  const session = await auth();
  return <LabShell session={session}>{children}</LabShell>;
}
