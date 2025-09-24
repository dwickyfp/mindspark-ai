import KnowledgeBaseDashboard from "@/components/knowledge-base/knowledge-base-dashboard";
import { knowledgeBaseRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { notFound } from "next/navigation";

export default async function KnowledgeBasePage() {
  const session = await getSession();

  if (!session?.user.id) {
    notFound();
  }

  const knowledgeBases =
    await knowledgeBaseRepository.listKnowledgeBasesForUser(session.user.id);

  return <KnowledgeBaseDashboard initialKnowledgeBases={knowledgeBases} />;
}
