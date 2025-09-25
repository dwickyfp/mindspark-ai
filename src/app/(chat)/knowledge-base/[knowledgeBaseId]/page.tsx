import KnowledgeBaseDetail from "@/components/knowledge-base/knowledge-base-detail";
import { knowledgeBaseRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { notFound } from "next/navigation";

export default async function KnowledgeBaseDetailPage({
  params,
}: {
  params: Promise<{ knowledgeBaseId: string }>;
}) {
  const { knowledgeBaseId } = await params;
  const session = await getSession();

  if (!session?.user.id) {
    notFound();
  }

  const knowledgeBase = await knowledgeBaseRepository.getKnowledgeBaseById(
    knowledgeBaseId,
    session.user.id,
  );

  if (!knowledgeBase) {
    notFound();
  }

  const documents = await knowledgeBaseRepository.listKnowledgeBaseDocuments(
    knowledgeBaseId,
    session.user.id,
  );

  return (
    <KnowledgeBaseDetail
      knowledgeBaseId={knowledgeBaseId}
      initialKnowledgeBase={knowledgeBase}
      initialDocuments={documents}
    />
  );
}
