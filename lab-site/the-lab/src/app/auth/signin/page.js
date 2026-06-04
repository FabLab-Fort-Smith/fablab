import { providerMap } from "../../../../auth";
import SignInClient from "./SignInClient";

export default function SignInPage() {
    return <SignInClient providers={providerMap} />;
}
