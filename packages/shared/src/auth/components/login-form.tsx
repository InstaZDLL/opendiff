import { SiGithub } from "@icons-pack/react-simple-icons";
import { Button } from "components/components/ui/button";
import { Input } from "components/components/ui/input";
import { cn } from "components/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";

type LoginProvider = "github" | "google" | "microsoft" | "email" | null;
type EmailStep = "enter" | "code";
type VerificationStatus = "loading" | "ready" | "error";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_LOAD_ERROR = "Human verification failed to load. Please refresh and try again.";
const TURNSTILE_EXECUTE_ERROR = "Unable to start verification. Please refresh and try again.";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          size?: "normal" | "compact" | "invisible";
          appearance?: "always" | "interaction-only" | "execute";
          execution?: "render" | "execute";
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      ready?: (callback: () => void) => void;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface LoginFormProps extends React.ComponentProps<"form"> {
  addAccount?: boolean;
  redirectUrl?: string | null;
  onVerificationStatusChange?: (status: VerificationStatus) => void;
}

/** Renders login buttons for GitHub, Google, and Microsoft authentication providers. */
export function LoginForm({
  className,
  addAccount,
  redirectUrl,
  onVerificationStatusChange,
  ...props
}: LoginFormProps) {
  const {
    login,
    loginWithGoogle,
    loginWithMicrosoft,
    setAddingAccount,
    startEmailLogin,
    verifyEmailLogin,
  } = useAuth();
  const navigate = useNavigate();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailStep, setEmailStep] = useState<EmailStep>("enter");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const hasTurnstile = !import.meta.env.DEV && !!turnstileSiteKey?.trim();
  const [verificationStatus, setVerificationStatusState] = useState<VerificationStatus>(
    hasTurnstile ? "loading" : "ready"
  );
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileTokenRef = useRef<string | null>(null);
  const pendingProviderRef = useRef<LoginProvider>(null);
  const eventListenerRef = useRef<{ script: HTMLScriptElement; listener: () => void } | null>(null);
  const startProviderLoginRef = useRef<
    (provider: Exclude<LoginProvider, null>, turnstileToken?: string) => void
  >(() => {});

  const setVerificationStatus = useCallback(
    (status: VerificationStatus) => {
      setVerificationStatusState(status);
      onVerificationStatusChange?.(status);
    },
    [onVerificationStatusChange]
  );

  const startProviderLogin = useCallback(
    (provider: Exclude<LoginProvider, null>, turnstileToken?: string) => {
      if (addAccount) {
        setAddingAccount();
      }

      if (provider === "github") {
        login(redirectUrl || undefined, turnstileToken);
        return;
      }

      if (provider === "google") {
        loginWithGoogle(redirectUrl || undefined, turnstileToken);
        return;
      }

      if (provider === "microsoft") {
        loginWithMicrosoft(redirectUrl || undefined, turnstileToken);
        return;
      }

      startEmailLogin(email.trim(), redirectUrl || undefined, turnstileToken).then((error) => {
        setLoadingProvider(null);
        if (error) {
          setEmailError(error);
        } else {
          setEmailError(null);
          setCode("");
          setEmailStep("code");
        }

        // The page stays open after an email request, so fetch a fresh token for the next one
        if (turnstileWidgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(turnstileWidgetIdRef.current);
            window.turnstile.execute(turnstileWidgetIdRef.current);
          } catch {
            setTurnstileError(TURNSTILE_EXECUTE_ERROR);
          }
        }
      });
    },
    [
      addAccount,
      email,
      login,
      loginWithGoogle,
      loginWithMicrosoft,
      redirectUrl,
      setAddingAccount,
      startEmailLogin,
    ]
  );

  useEffect(() => {
    startProviderLoginRef.current = startProviderLogin;
  }, [startProviderLogin]);

  useEffect(() => {
    const siteKey = turnstileSiteKey?.trim();

    if (!hasTurnstile || !siteKey) {
      setVerificationStatus("ready");
      return;
    }

    setVerificationStatus("loading");

    if (!turnstileContainerRef.current) {
      return;
    }

    let isMounted = true;

    const markScriptStatus = (status: "loaded" | "error") => {
      const script = document.querySelector<HTMLScriptElement>(
        `script[src="${TURNSTILE_SCRIPT_SRC}"]`
      );
      if (script) {
        script.dataset.turnstileStatus = status;
      }
    };

    const renderWidget = () => {
      if (
        !isMounted ||
        !window.turnstile ||
        !turnstileContainerRef.current ||
        turnstileWidgetIdRef.current
      ) {
        return;
      }

      try {
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          size: "invisible",
          appearance: "execute",
          execution: "execute",
          theme: "dark",
          callback: (token: string) => {
            const provider = pendingProviderRef.current;
            pendingProviderRef.current = null;
            setTurnstileError(null);

            if (!provider) {
              turnstileTokenRef.current = token;
              setVerificationStatus("ready");
              return;
            }

            startProviderLoginRef.current(provider, token);
          },
          "error-callback": () => {
            turnstileTokenRef.current = null;
            pendingProviderRef.current = null;
            setLoadingProvider(null);
            setVerificationStatus("error");
            setTurnstileError("Verification failed. Please try again.");
          },
          "expired-callback": () => {
            turnstileTokenRef.current = null;
            pendingProviderRef.current = null;
            setLoadingProvider(null);
            setTurnstileError(null);
            setVerificationStatus("loading");

            if (turnstileWidgetIdRef.current && window.turnstile) {
              try {
                window.turnstile.reset(turnstileWidgetIdRef.current);
                window.turnstile.execute(turnstileWidgetIdRef.current);
              } catch {
                setVerificationStatus("error");
                setTurnstileError(TURNSTILE_EXECUTE_ERROR);
              }
            }
          },
        });
        setTurnstileError(null);
      } catch {
        markScriptStatus("error");
        setVerificationStatus("error");
        setTurnstileError(TURNSTILE_LOAD_ERROR);
        return;
      }

      try {
        window.turnstile.execute(turnstileWidgetIdRef.current);
      } catch {
        setVerificationStatus("error");
        setTurnstileError(TURNSTILE_EXECUTE_ERROR);
      }
    };

    const renderWhenReady = () => {
      if (!window.turnstile) {
        return;
      }

      renderWidget();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`
    );
    const script = existingScript ?? document.createElement("script");
    const handleLoad = () => {
      script.dataset.turnstileStatus = "loaded";
      renderWhenReady();
    };
    const handleError = () => {
      if (!isMounted) {
        return;
      }

      script.dataset.turnstileStatus = "error";
      setVerificationStatus("error");
      setTurnstileError(TURNSTILE_LOAD_ERROR);
    };

    if (window.turnstile) {
      renderWhenReady();
    } else if (existingScript?.dataset.turnstileStatus === "error") {
      setVerificationStatus("error");
      setTurnstileError(TURNSTILE_LOAD_ERROR);
    } else {
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
      eventListenerRef.current = { script, listener: handleLoad };

      if (!existingScript) {
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      isMounted = false;

      if (eventListenerRef.current) {
        eventListenerRef.current.script.removeEventListener(
          "load",
          eventListenerRef.current.listener
        );
        eventListenerRef.current.script.removeEventListener("error", handleError);
        eventListenerRef.current = null;
      }

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }

      turnstileTokenRef.current = null;
      pendingProviderRef.current = null;
    };
  }, [hasTurnstile, setVerificationStatus]);

  const handleProviderLogin = (provider: Exclude<LoginProvider, null>) => {
    setLoadingProvider(provider);
    setTurnstileError(null);

    // Check if Turnstile is configured via environment variable
    if (!hasTurnstile) {
      if (import.meta.env.DEV) {
        console.warn(
          "Turnstile is disabled in development. Proceeding without human verification."
        );
      }
      startProviderLogin(provider);
      return;
    }

    if (verificationStatus !== "ready" || !window.turnstile || !turnstileWidgetIdRef.current) {
      setLoadingProvider(null);
      setTurnstileError("Human verification is loading. Please try again.");
      return;
    }

    if (turnstileTokenRef.current) {
      const token = turnstileTokenRef.current;
      turnstileTokenRef.current = null;
      startProviderLogin(provider, token);
      return;
    }

    pendingProviderRef.current = provider;

    try {
      window.turnstile.execute(turnstileWidgetIdRef.current);
    } catch {
      pendingProviderRef.current = null;
      setLoadingProvider(null);
      setTurnstileError(TURNSTILE_EXECUTE_ERROR);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);

    if (emailStep === "enter") {
      if (!email.trim()) {
        setEmailError("Enter your email address.");
        return;
      }
      handleProviderLogin("email");
      return;
    }

    setIsVerifyingCode(true);
    const result = await verifyEmailLogin({ email: email.trim(), code });
    setIsVerifyingCode(false);

    if ("error" in result) {
      setEmailError(result.error);
      return;
    }

    const callbackUrl = new URLSearchParams({ user: JSON.stringify(result.user) });
    if (redirectUrl) callbackUrl.set("redirectUrl", redirectUrl);
    navigate(`/auth/callback?${callbackUrl.toString()}`);
  };

  const isLoading = loadingProvider !== null || isVerifyingCode;
  const showVerificationGate = hasTurnstile && verificationStatus !== "ready";

  return (
    <form
      className={cn("grid w-full max-w-[380px] gap-3 mx-auto", className)}
      onSubmit={handleSubmit}
      noValidate
      {...props}
    >
      {showVerificationGate ? (
        <div className="flex min-h-28 items-center justify-center text-center">
          {verificationStatus === "loading" ? (
            <HugeiconsIcon icon={Loading03Icon} className="size-8 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-destructive">{turnstileError || TURNSTILE_LOAD_ERROR}</p>
          )}
        </div>
      ) : emailStep === "code" ? (
        <>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="text-foreground">{email.trim()}</span>. Enter
            it below, or use the link in the email.
          </p>
          <Input
            size="lg"
            className="rounded-full"
            aria-label="Sign-in code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          <Button type="submit" size="lg" className="rounded-full" disabled={isLoading || code.length !== 6}>
            {isVerifyingCode && <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />}
            Continue
          </Button>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setEmailStep("enter");
                setEmailError(null);
              }}
            >
              Use a different email
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={isLoading}
              onClick={() => handleProviderLogin("email")}
            >
              {loadingProvider === "email" ? "Sending…" : "Resend code"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Input
            size="lg"
            className="rounded-full"
            type="email"
            aria-label="Email address"
            autoComplete="email"
            placeholder="name@work-email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          <Button type="submit" variant="secondary" size="lg" className="rounded-full" disabled={isLoading}>
            {loadingProvider === "email" && (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
            )}
            Continue with email
          </Button>
          <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            size="lg"
            className="rounded-full"
            onClick={() => handleProviderLogin("github")}
            disabled={isLoading}
          >
            {loadingProvider === "github" ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
            ) : (
              <SiGithub className="size-4" />
            )}
            {addAccount ? "Add GitHub account" : "Login with GitHub"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="rounded-full"
            type="button"
            onClick={() => handleProviderLogin("google")}
            disabled={isLoading}
          >
            {loadingProvider === "google" ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
            ) : (
              <img src="/icons/google-icon.svg" alt="" className="size-4" />
            )}
            {addAccount ? "Add Google account" : "Login with Google"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="rounded-full"
            type="button"
            onClick={() => handleProviderLogin("microsoft")}
            disabled={isLoading}
          >
            {loadingProvider === "microsoft" ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
            ) : (
              <img src="/icons/microsoft-icon.svg" alt="" className="size-4" />
            )}
            {addAccount ? "Add Microsoft account" : "Login with Microsoft"}
          </Button>
        </>
      )}
      {hasTurnstile && (
        <>
          <div ref={turnstileContainerRef} className="h-0 w-0 overflow-hidden" aria-hidden="true" />
          {!showVerificationGate && turnstileError && (
            <p className="text-sm text-destructive -mt-1">{turnstileError}</p>
          )}
        </>
      )}
    </form>
  );
}
