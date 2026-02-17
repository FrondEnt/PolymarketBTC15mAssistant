import Dashboard from "@/components/Dashboard";

const VALID_INTERVALS = ["5", "15"];

export default async function BtcPage({
  params,
}: {
  params: Promise<{ interval: string }>;
}) {
  const { interval } = await params;

  if (!VALID_INTERVALS.includes(interval)) {
    return <div>Invalid interval. Supported: {VALID_INTERVALS.join(", ")}</div>;
  }

  return <Dashboard interval={Number(interval)} />;
}
