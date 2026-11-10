import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/page-auth";
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  await requirePageAuth();
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
