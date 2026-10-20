import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";

/**
 * Landing page for the sign-in link in the email. The link carries a one-time token that is only
 * redeemed by this POST from the browser, so email scanners that prefetch links can't use it up.
 */
export function EmailLinkPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmailLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const token = searchParams.get("token");
    const redirectUrl = searchParams.get("redirectUrl");

    if (!token) {
      setError("This sign-in link is incomplete. Request a new one.");
      return;
    }

    verifyEmailLogin({ token }).then((result) => {
      if ("error" in result) {
        setError(result.error);
        return;
      }

      const callbackParams = new URLSearchParams({ user: JSON.stringify(result.user) });
      if (redirectUrl) callbackParams.set("redirectUrl", redirectUrl);
      navigate(`/auth/callback?${callbackParams.toString()}`, { replace: true });
    });
  }, [searchParams, navigate, verifyEmailLogin]);

  return (
    <section className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      {error ? (
        <>
          <p className="max-w-sm text-destructive">{error}</p>
          <Button asChild variant="secondary">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </>
      ) : (
        <HugeiconsIcon icon={Loading03Icon} className="size-8 animate-spin text-muted-foreground" />
      )}
    </section>
  );
}
