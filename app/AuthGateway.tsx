"use client";

import Image from "next/image";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";

type Role = "customer" | "admin";
type Mode = "login" | "register";

export default function AuthGateway({ adminSetupRequired }: { adminSetupRequired: boolean }) {
  const [role, setRole] = useState<Role>("customer");
  const [customerMode, setCustomerMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const mode: Mode = role === "admin" && adminSetupRequired ? "register" : role === "customer" ? customerMode : "login";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, role }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Access could not be verified.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access could not be verified.");
      setSubmitting(false);
    }
  }

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setError("");
  }

  return <main className="auth-page">
    <section className="auth-brand-panel" aria-label="The Zaza Club brand introduction">
      <div className="auth-brand-glow" />
      <div className="auth-brand-content">
        <Image className="auth-logo" src="/the-zaza-club-logo.jpeg" alt="The Zaza Club" width={260} height={260} priority />
        <p className="auth-kicker"><Sparkles size={15} />Private inventory + ordering</p>
        <h1>Stock the club.<br /><span>Serve every order.</span></h1>
        <p className="auth-brand-copy">One connected workspace for live inventory, purchasing, customer orders, and dependable stock visibility.</p>
        <div className="auth-values"><span>Fresh stock visibility</span><span>Fast fulfillment</span><span>Built for the club</span></div>
      </div>
      <footer>The Zaza Club · Inventory Operations</footer>
    </section>

    <section className="auth-access-panel">
      <div className="auth-card">
        <div className="auth-card-head">
          <p className="gold-eyebrow">Secure portal access</p>
          <h2>Welcome to The Zaza Club</h2>
          <p>Choose your portal, then sign in to continue.</p>
        </div>

        <div className="role-switch" role="tablist" aria-label="Choose account type">
          <button type="button" role="tab" aria-selected={role === "customer"} className={role === "customer" ? "active" : ""} onClick={() => chooseRole("customer")}>
            <span><UserRound /></span><div><strong>Customer</strong><small>Browse and place orders</small></div>
          </button>
          <button type="button" role="tab" aria-selected={role === "admin"} className={role === "admin" ? "active" : ""} onClick={() => chooseRole("admin")}>
            <span><ShieldCheck /></span><div><strong>Administrator</strong><small>Manage inventory operations</small></div>
          </button>
        </div>

        <div className="auth-form-intro">
          <div className={`portal-icon ${role}`}><span>{role === "admin" ? <ShieldCheck /> : <UserRound />}</span></div>
          <div><strong>{mode === "register" ? role === "admin" ? "Set up administrator" : "Create customer account" : `${role === "admin" ? "Administrator" : "Customer"} sign in`}</strong>
            <p>{role === "admin" && adminSetupRequired ? "Create the first protected administrator account for this workspace." : mode === "register" ? "Create your account to start ordering." : `Enter your ${role} account details.`}</p></div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <label><span>Full name</span><input name="displayName" autoComplete="name" required minLength={2} placeholder={role === "admin" ? "Administrator name" : "Your name"} /></label>}
          <label><span>Email address</span><input name="email" type="email" autoComplete="email" required placeholder={role === "admin" ? "admin@company.com" : "customer@example.com"} /></label>
          <label><span>Password</span><div className="password-field"><LockKeyhole size={17} /><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 10 : undefined} placeholder={mode === "register" ? "At least 10 characters" : "Enter your password"} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" disabled={submitting}>{submitting ? <span className="auth-spinner" /> : <>{mode === "register" ? "Create account" : "Sign in"}<ArrowRight size={18} /></>}</button>
        </form>

        {role === "customer" && <button type="button" className="auth-mode-toggle" onClick={() => { setCustomerMode((current) => current === "login" ? "register" : "login"); setError(""); }}>
          {customerMode === "login" ? <>New customer? <strong>Create an account</strong></> : <>Already registered? <strong>Sign in instead</strong></>}
        </button>}
        {role === "admin" && adminSetupRequired && <p className="setup-note"><ShieldCheck size={15} />Only the first administrator can complete this one-time setup.</p>}
      </div>
      <p className="auth-trust"><LockKeyhole size={14} />Protected access · Encrypted credentials · Server-managed sessions</p>
    </section>
  </main>;
}
