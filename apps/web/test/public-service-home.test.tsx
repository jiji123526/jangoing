import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicServiceHome } from "../app/PublicServiceHome";

describe("public service home", () => {
  it("renders the public product preview without private app content", () => {
    const markup = renderToStaticMarkup(
      <PublicServiceHome
        accountLabel="Sign in to Jangoing"
        needsSetup={false}
        onStart={vi.fn()}
      />,
    );

    expect(markup).toContain("Your kitchen, remembered");
    expect(markup).toContain("What Jangoing Tracks");
    expect(markup).toContain("Example Kitchen");
    expect(markup).toContain("Built for Households");
    expect(markup).toContain("Waste Prevention");
    expect(markup).toContain("Your kitchen stays private");
    expect(markup).not.toContain("Quick Update");
    expect(markup).not.toContain("Tell Jangoing what changed");
  });

  it("exposes the setup state through the account control", () => {
    const markup = renderToStaticMarkup(
      <PublicServiceHome
        accountLabel="Finish household setup"
        needsSetup
        onStart={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Finish household setup"');
    expect(markup).toContain('class="public-home-account"');
  });
});
