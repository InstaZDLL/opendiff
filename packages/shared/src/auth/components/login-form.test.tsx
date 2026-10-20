import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../test/test-utils";
import { LoginForm } from "./login-form";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const originalLocation = window.location;

function renderLoginForm(props: React.ComponentProps<typeof LoginForm> = {}) {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginForm {...props} />} />
        <Route path="/auth/callback" element={<p>callback reached</p>} />
      </Routes>
    </MemoryRouter>,
    { wrapper: createWrapper() }
  );
}

async function getTurnstileScript() {
  await waitFor(() => {
    expect(document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)).toBeInTheDocument();
  });

  const script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
  expect(script).toBeInstanceOf(HTMLScriptElement);

  return script as HTMLScriptElement;
}

beforeEach(() => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...originalLocation, href: "" },
  });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  for (const script of document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) {
    script.remove();
  }
  window.turnstile = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("keeps provider buttons hidden until Turnstile has produced a token", async () => {
    const onVerificationStatusChange = vi.fn();
    renderLoginForm({ onVerificationStatusChange });

    expect(screen.queryByRole("button", { name: /login with github/i })).not.toBeInTheDocument();

    const script = await getTurnstileScript();
    let callback: ((token: string) => void) | undefined;
    const execute = vi.fn(() => callback?.("turnstile-token"));
    window.turnstile = {
      render: vi.fn((_container, options) => {
        callback = options.callback;
        return "widget-id";
      }),
      execute,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    fireEvent.load(script);

    const githubButton = await screen.findByRole("button", { name: /login with github/i });
    expect(onVerificationStatusChange).toHaveBeenCalledWith("ready");
    const executeCallsBeforeClick = execute.mock.calls.length;

    fireEvent.click(githubButton);

    await waitFor(() => {
      expect(window.location.href).toContain("/auth/github");
      expect(window.location.href).toContain("turnstileToken=turnstile-token");
    });
    expect(execute).toHaveBeenCalledTimes(executeCallsBeforeClick);
  });

  it("waits for an already injected Turnstile script to load after remounting", async () => {
    const firstRender = renderLoginForm();
    const script = await getTurnstileScript();
    firstRender.unmount();

    const onVerificationStatusChange = vi.fn();
    renderLoginForm({ onVerificationStatusChange });

    expect(screen.queryByRole("button", { name: /login with github/i })).not.toBeInTheDocument();

    window.turnstile = {
      render: vi.fn((_container, options) => {
        options.callback("turnstile-token");
        return "widget-id";
      }),
      execute: vi.fn(),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    fireEvent.load(script);

    await screen.findByRole("button", { name: /login with github/i });
    expect(onVerificationStatusChange).toHaveBeenCalledWith("ready");
  });

  it("does not call turnstile.ready after the async script loads", async () => {
    const onVerificationStatusChange = vi.fn();
    renderLoginForm({ onVerificationStatusChange });

    const script = await getTurnstileScript();
    const ready = vi.fn(() => {
      throw new Error("ready is incompatible with async script loading");
    });

    window.turnstile = {
      render: vi.fn((_container, options) => {
        options.callback("turnstile-token");
        return "widget-id";
      }),
      ready,
      execute: vi.fn(),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    fireEvent.load(script);

    await screen.findByRole("button", { name: /login with github/i });
    expect(ready).not.toHaveBeenCalled();
    expect(onVerificationStatusChange).toHaveBeenCalledWith("ready");
  });

  describe("email sign-in", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    });

    it("requests a code and shows the code step", async () => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      renderLoginForm();

      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "dev@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));

      expect(await screen.findByLabelText("Sign-in code")).toBeInTheDocument();
      expect(screen.getByText("dev@example.com")).toBeInTheDocument();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/auth/email/start");
      expect(JSON.parse(String(init.body)).email).toBe("dev@example.com");
    });

    it("verifies the code and continues to the auth callback", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ visitorId: "u1", access_token: "cst_x", auth_provider: "email" }),
            { status: 200 }
          )
        );
      renderLoginForm();

      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "dev@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
      fireEvent.change(await screen.findByLabelText("Sign-in code"), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

      expect(await screen.findByText("callback reached")).toBeInTheDocument();
    });
  });
});
