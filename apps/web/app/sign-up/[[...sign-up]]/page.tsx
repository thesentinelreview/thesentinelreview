import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "#070F1E" }}>
      <SignUp />
    </div>
  );
}
