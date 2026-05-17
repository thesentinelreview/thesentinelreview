import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "#070F1E" }}>
      <SignIn />
    </div>
  );
}
