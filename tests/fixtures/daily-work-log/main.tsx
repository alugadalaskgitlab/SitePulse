import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DailyWorkLog from "../../../client/src/pages/DailyWorkLog";
import "../../../client/src/index.css";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const team = {
  date: today,
  view: "team",
  workEntries: [{
    id: 9201, personnelId: 402, personName: "BETA ENGINEER", createdByUserId: 9002,
    workDate: today, place: "Plant office", workType: "Stores / records",
    siteId: null, siteName: null, durationMinutes: 120,
    details: "Checked the HMP material balance and prepared the dispatch note.",
  }],
  visits: [],
  dprActivities: [{
    id: 9301, dprId: 418, date: today, site: "ALLADURG PWD ROAD TO PAMPAD",
    personnelId: 402, personName: "BETA ENGINEER", type: "test",
    title: "Field density", details: "WMM · Result 97.8 · Required 97",
    resultPass: true, href: "/site/edit/418", place: "Site: ALLADURG PWD ROAD TO PAMPAD",
  }],
  totalDurationMinutes: 120,
};

window.fetch = async input => {
  const url = String(input);
  const body = url.includes("/context")
    ? {
      linked: true, personName: "ALPHA ENGINEER", teamViewAllowed: true,
      sites: [{ id: 4, name: "ALLADURG PWD ROAD TO PAMPAD" }],
    }
    : url.includes("view=team")
      ? team
      : { date: today, view: "personal", workEntries: [], visits: [], dprActivities: [], totalDurationMinutes: 0 };
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
};

function Fixture() {
  useEffect(() => {
    const timer = window.setInterval(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find(element => element.textContent?.trim() === "Team view");
      if (button) {
        button.click();
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return <DailyWorkLog />;
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}><Fixture /></QueryClientProvider>,
);
