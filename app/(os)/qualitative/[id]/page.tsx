import { QualDetail } from "@/components/screens/labs";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QualDetail id={id} />;
}
