import { describe, expect, it, vi } from "vitest";
import { SITE } from "@/shared/config/site";
import { renderEmail } from "./layout";
import { mailtoHref } from "./links";
import type { EmailBlock, EmailDocument } from "./types";

function doc(blocks: EmailBlock[], overrides: Partial<EmailDocument> = {}): EmailDocument {
  return {
    locale: "lt",
    preheader: "Trumpa santrauka.",
    heading: "Planas aktyvuotas",
    blocks,
    footer: { legalName: "Smart Auto Bid LLC", note: "Paslaugos pranešimas." },
    ...overrides,
  };
}

describe("escaping", () => {
  it("never lets caller text become markup", () => {
    // A name is the realistic vector, not an attack: the field is free text on
    // a public registration form.
    const { html } = renderEmail(
      doc([{ kind: "paragraph", text: "Sveiki, <script>alert(1)</script>," }], {
        heading: "<img onerror=x>",
      })
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders ampersands as themselves, not as broken entities", () => {
    const { html, text } = renderEmail(
      doc([{ kind: "details", rows: [{ label: "Pardavėjas", value: "Smith & Sons" }] }])
    );

    expect(html).toContain("Smith &amp; Sons");
    expect(html).not.toContain("Smith & Sons");
    expect(text).toContain("Smith & Sons");
  });

  it("escapes a quote inside an attribute value", () => {
    const { html } = renderEmail(
      doc([{ kind: "image", src: 'https://x/a"onerror="y', alt: "Nuotrauka", width: 1, height: 1 }])
    );

    expect(html).not.toContain('"onerror="');
    expect(html).toContain("&quot;onerror=&quot;");
  });
});

describe("inline markup", () => {
  it("makes links in both renderings", () => {
    const { html, text } = renderEmail(
      doc([
        { kind: "paragraph", text: "Žr. [Sąlygas](https://smartautobid.com/terms) prieš tęsiant." },
      ])
    );

    expect(html).toContain('href="https://smartautobid.com/terms"');
    expect(html).toContain(">Sąlygas</a>");
    // The text part keeps the label AND the URL — a bare label in plain text
    // is a link the recipient cannot follow.
    expect(text).toContain("Žr. Sąlygas (https://smartautobid.com/terms) prieš tęsiant.");
  });

  it("leaves a non-http scheme as literal text", () => {
    const { html } = renderEmail(
      doc([{ kind: "paragraph", text: "[Spauskite](javascript:alert(1))" }])
    );

    expect(html).not.toContain("href=\"javascript:");
    expect(html).toContain("[Spauskite](javascript:alert(1))");
  });

  it("bolds without leaving asterisks in the text part", () => {
    const { html, text } = renderEmail(doc([{ kind: "paragraph", text: "Liko **24 valandos**." }]));

    expect(html).toContain("<strong>24 valandos</strong>");
    expect(text).toContain("Liko 24 valandos.");
    expect(text).not.toContain("**");
  });
});

describe("the two renderings stay in step", () => {
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: "Patvirtinome jūsų depozitą." },
    {
      kind: "details",
      rows: [
        { label: "Planas", value: "Bronza" },
        { label: "Suma", value: "$1 500", emphasis: true, note: "grąžinama" },
      ],
    },
    { kind: "panel", title: "Ką darome toliau", text: "Apmokame aukcionui." },
    { kind: "progress", step: 5, total: 8, startLabel: "Laimėta", endLabel: "Pristatyta" },
    { kind: "button", label: "Peržiūrėti planą", href: "https://smartautobid.com/account/plan" },
    { kind: "fineprint", text: "Tai paslaugos pranešimas." },
  ];

  it("carries every block's content into the text part", () => {
    const { text } = renderEmail(doc(blocks));

    expect(text).toContain("Patvirtinome jūsų depozitą.");
    expect(text).toContain("Planas: Bronza");
    expect(text).toContain("Suma: $1 500 (grąžinama)");
    expect(text).toContain("Ką darome toliau");
    expect(text).toContain("5/8");
    expect(text).toContain("https://smartautobid.com/account/plan");
    expect(text).toContain("Tai paslaugos pranešimas.");
  });

  it("leaves no markup in the text part", () => {
    const { text } = renderEmail(doc(blocks));

    expect(text).not.toMatch(/<[a-z/]/i);
    expect(text).not.toContain("&amp;");
    expect(text).not.toContain("&nbsp;");
  });

  it("does not repeat the URL when a fallback follows a button", () => {
    // In HTML the fallback exists because the button may not render. In text
    // the button already is a URL, so printing it twice is noise.
    const { text, html } = renderEmail(
      doc([
        { kind: "button", label: "Patvirtinti", href: "https://smartautobid.com/v?t=1" },
        { kind: "urlFallback", hint: "Mygtukas neveikia?", href: "https://smartautobid.com/v?t=1" },
      ])
    );

    expect(html.match(/https:\/\/smartautobid\.com\/v\?t=1/g)).toHaveLength(3); // href, href, visible text
    expect(text.match(/https:\/\/smartautobid\.com\/v\?t=1/g)).toHaveLength(1);
    expect(text).not.toContain("Mygtukas neveikia?");
  });
});

describe("the preheader", () => {
  it("is present and hidden", () => {
    const { html } = renderEmail(doc([], { preheader: "Depozitas patvirtintas." }));

    expect(html).toContain("Depozitas patvirtintas.");
    expect(html).toContain("display:none");
    expect(html).toContain("mso-hide:all");
  });
});

describe("progress", () => {
  it("clamps a step past the end rather than overflowing the track", () => {
    const { html } = renderEmail(
      doc([{ kind: "progress", step: 12, total: 8, startLabel: "A", endLabel: "B" }])
    );

    // A bar wider than its track is the failure mode: the cell overflows the
    // row and the layout below it shifts.
    const widths = [...html.matchAll(/width:(\d+)%/g)].map((m) => Number(m[1]));
    expect(Math.max(...widths)).toBe(100);
  });

  it("survives a zero total instead of dividing by it", () => {
    const { html } = renderEmail(
      doc([{ kind: "progress", step: 1, total: 0, startLabel: "A", endLabel: "B" }])
    );

    // Nothing done means no filled cell at all. A zero-width cell is not the
    // same thing: several clients give it a stub of colour anyway.
    expect(html).not.toContain(`width="0%"`);
    expect(html).toContain("A");
  });

  it("gives the bar a height three different ways", () => {
    // Clients disagree about which one they honour, and a bar with no height
    // is an invisible bar — that is what the phone showed.
    const { html } = renderEmail(
      doc([{ kind: "progress", step: 5, total: 8, startLabel: "A", endLabel: "B" }])
    );

    expect(html).toContain(`height="8"`);
    expect(html).toContain("height:8px");
    expect(html).toContain("line-height:8px");
    // font-size:0 leaves a client that ignores CSS height nothing to work from.
    expect(html).not.toContain("font-size:0;background");
  });
});

describe("tone", () => {
  it("drops the brand accent for a message nobody wanted", () => {
    const refund = renderEmail(
      doc([{ kind: "button", label: "Planai", href: "https://smartautobid.com/plans" }], {
        tone: "neutral",
      })
    ).html;

    // The amber accent survives nowhere in a neutral message — not the rule,
    // not the button, not the badge.
    expect(refund).not.toContain("#c36624");
    expect(refund).not.toContain("#a8531b");
    expect(refund).toContain("#b3afab");
  });
});

describe("contrast", () => {
  it("never puts white type on the lighter amber", () => {
    // white on #c36624 measures 4.00:1 and fails AA; #a8531b clears it at
    // 5.36:1. The lighter step is allowed only where no text sits on it.
    const { html } = renderEmail(
      doc([{ kind: "button", label: "Tęsti", href: "https://smartautobid.com/x" }])
    );

    expect(html).toContain("#a8531b");
    expect(html).not.toMatch(/bgcolor="#c36624"/);
  });

  it("keeps the failing grey out of light-ground text", () => {
    // #8a8581 on white is 3.65:1. It is legitimate on the dark card, so it may
    // appear inside the dark-mode block and nowhere else.
    const { html } = renderEmail(
      doc([{ kind: "details", rows: [{ label: "Planas", value: "Bronza" }] }])
    );
    const head = html.indexOf("<style>");
    const tail = html.lastIndexOf("</style>") + "</style>".length;
    const withoutDarkRules = html.slice(0, head) + html.slice(tail);

    expect(withoutDarkRules).not.toContain("#8a8581");
    expect(html).toContain("#8a8581");
  });
});

describe("contact details", () => {
  it("comes from site.ts rather than the template", () => {
    // ARCHITECTURE.md §5 invariant 1. These previously lived in seven files.
    const { html, text } = renderEmail(doc([]));

    for (const value of [SITE.email, SITE.domain, SITE.phone.display]) {
      expect(html).toContain(value);
      expect(text).toContain(value);
    }
  });
});

describe("bare URLs", () => {
  it("links a URL that copy interpolated without markup", () => {
    // Every string in Plans.decisionEmail is shaped this way: a sentence with
    // {url} dropped into it. Before autolinking it rendered as grey text the
    // recipient had to select and paste.
    const { html, text } = renderEmail(
      doc([
        {
          kind: "paragraph",
          text: "Peržiūrėti galite čia: https://smartautobid.com/account/plan\nKlausimai?",
        },
      ])
    );

    expect(html).toContain('href="https://smartautobid.com/account/plan"');
    expect(text).toContain("Peržiūrėti galite čia: https://smartautobid.com/account/plan");
  });

  it("does not swallow the sentence's full stop into the link", () => {
    const { html } = renderEmail(
      doc([{ kind: "paragraph", text: "Žr. https://smartautobid.com/terms." }])
    );

    expect(html).toContain('href="https://smartautobid.com/terms"');
    expect(html).not.toContain('href="https://smartautobid.com/terms."');
  });

  it("wraps an explicit link once, not twice", () => {
    const { html } = renderEmail(
      doc([{ kind: "paragraph", text: "[Sąlygos](https://smartautobid.com/terms)" }])
    );

    expect(html.match(/<a /g)).toHaveLength(4); // 1 body + 3 in the footer
  });
});

describe("the footer without a translator", () => {
  it("still carries the brand and the contact row", () => {
    const { html, text } = renderEmail(doc([], { footer: undefined }));

    expect(html).toContain(SITE.name);
    expect(html).toContain(SITE.email);
    expect(text).toContain(SITE.domain);
  });

  it("omits the entity separator rather than leaving it dangling", () => {
    const { html } = renderEmail(doc([], { footer: {} }));

    expect(html).not.toContain("</strong> · <br>");
    expect(html).not.toContain("undefined");
  });
});

describe("dimensions survive a client that ignores attributes", () => {
  it("repeats every full-width table's width in CSS", () => {
    // Gmail's mobile app ignores width="100%" on a table and collapses it to
    // its content. That is what shrank the progress bar to an orange stub and
    // ran its two end labels together into one word.
    const { html } = renderEmail(
      doc([
        { kind: "details", rows: [{ label: "A", value: "B" }] },
        { kind: "progress", step: 5, total: 8, startLabel: "A", endLabel: "B" },
        { kind: "panel", text: "x" },
      ])
    );

    const tags = html
      .split("<table")
      .slice(1)
      .map((tail) => tail.slice(0, tail.indexOf(">")));
    const attributeOnly = tags.filter(
      (tag) => tag.includes('width="100%"') && !tag.includes("width:100%")
    );

    expect(attributeOnly).toEqual([]);
  });

  it("sizes the logo in CSS, not only in attributes", () => {
    // Same failure, worse consequence: the mark drew at its intrinsic 460px
    // and pushed everything beside it off the header.
    const { html } = renderEmail(doc([]));
    const start = html.indexOf("<img");
    const img = html.slice(start, html.indexOf(">", start));

    expect(img).toContain("width:230px");
    expect(img).toContain("height:48px");
    expect(img).toContain("max-width:100%");
  });
});

describe("the reference", () => {
  it("sits under the heading rather than beside the wordmark", () => {
    // A case number next to the logo reads as part of the logo. It belongs to
    // the message, so it lives with the message.
    const { html } = renderEmail(doc([], { reference: "SAB-2418" }));
    const at = html.indexOf("SAB-2418");

    expect(at).toBeGreaterThan(html.indexOf("m-head"));
    expect(at).toBeGreaterThan(html.indexOf("m-h1"));
  });
});

describe("addresses written into copy", () => {
  it("owns the styling of a bare email rather than leaving it to the client", () => {
    // Left alone, the mail client links it and paints it its own blue — one
    // stray blue address among brand-amber links looks like a foreign element.
    const { html, text } = renderEmail(
      doc([{ kind: "paragraph", text: "Klausimais rašykite info@smartautobid.com." }])
    );

    expect(html).toContain('href="mailto:info@smartautobid.com"');
    expect(html).toContain("#a8531b");
    // The full stop stays outside the link.
    expect(html).not.toContain('href="mailto:info@smartautobid.com."');
    expect(text).toContain("rašykite info@smartautobid.com.");
  });

  it("does not mistake the tail of a URL for an email", () => {
    const { html } = renderEmail(
      doc([{ kind: "paragraph", text: "https://smartautobid.com/a?to=x@y.com" }])
    );

    expect(html).toContain('href="https://smartautobid.com/a?to=x@y.com"');
    // The footer always carries a mailto, so look for the address that would
    // have been wrongly extracted out of the query string.
    expect(html).not.toContain("mailto:x@y.com");
  });
});

describe("the URL fallback", () => {
  it("prints no hint when none is given", () => {
    // The verification email passed the paragraph above the button here, and
    // the same sentence appeared twice in a row.
    const { html } = renderEmail(
      doc([
        { kind: "button", label: "Patvirtinti", href: "https://smartautobid.com/v?t=1" },
        { kind: "urlFallback", href: "https://smartautobid.com/v?t=1" },
      ])
    );

    expect(html).toContain("https://smartautobid.com/v?t=1");
    // `m-quiet` also names a dark-mode rule in the stylesheet, so look for the
    // element rather than the string.
    expect(html).not.toContain("<p class=\"m-quiet\"");
  });
});

describe("the progress bar on a narrow client", () => {
  it("gives both cells a binding pixel width", () => {
    // One cell sized and the other left to take the remainder is the setup
    // that collapses: deciding how to distribute that remainder is exactly
    // where a narrow client chooses "as little as the content needs".
    const { html } = renderEmail(
      doc([{ kind: "progress", step: 5, total: 8, startLabel: "A", endLabel: "B" }])
    );

    // 536px of usable column: 600 card less 32px padding each side. A pixel
    // has nothing to resolve against, which is the point — see progressHtml.
    expect(html).toContain('width="338"');
    expect(html).toContain('width="198"');
    expect(html).toContain("table-layout:fixed");
  });

  it("splits the two end labels down the middle", () => {
    const { html } = renderEmail(
      doc([
        {
          kind: "progress",
          step: 5,
          total: 8,
          startLabel: "Laimėta aukcione",
          endLabel: "Pristatyta",
        },
      ])
    );

    expect(html.match(/width="268"/g)).toHaveLength(2);
  });
});

describe("button safety", () => {
  it("allows the mailto a payment-confirmation button needs", () => {
    const { html } = renderEmail(
      doc([
        {
          kind: "button",
          label: "Siųsti mokėjimo patvirtinimą",
          href: mailtoHref("billing@smartautobid.com", "Nojus - payment confirmation - SAB-2418-01"),
        },
      ])
    );

    expect(html).toContain("mailto:billing@smartautobid.com?subject=");
    expect(html).toContain("payment%20confirmation");
  });

  it("refuses any other scheme, without dropping the message", () => {
    // A button is the one element a recipient is invited to press. It renders
    // as inert text instead — the email still goes, the trap does not.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { html } = renderEmail(
      doc([{ kind: "button", label: "Spauskite", href: "javascript:alert(1)" }])
    );

    expect(html).not.toContain("javascript:");
    expect(html).toContain("Spauskite");
  });
});

describe("mailtoHref", () => {
  it("encodes a subject a client would otherwise break", () => {
    const href = mailtoHref("billing@smartautobid.com", "Nojus & Co - sąskaita #1");

    expect(href).toContain("Nojus%20%26%20Co");
    expect(href).not.toContain(" ");
  });
});
