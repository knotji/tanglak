import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  getDocument,
  getDocumentExtraction,
  listDebts,
  listRecentConfirmedTransactions,
} from "@/lib/data/finance-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMockAuthEnabled } from "@/lib/auth/session";
import { ReviewForm } from "./ReviewForm";
import { findDuplicateCandidates } from "@/lib/finance/duplicates";
import { bahtToSatang } from "@/lib/finance/money";
import type { Transaction } from "@/types/domain";
import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";

interface PageProps {
  params: Promise<{ documentId: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  const { documentId } = await params;
  const user = await requireUser();
  const doc = await getDocument(user.id, documentId);

  if (!doc) {
    notFound();
  }

  // 1. Generate short-lived signed URL for private preview
  let previewUrl = "";
  if (!isMockAuthEnabled()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.storage
      .from("financial-documents")
      .createSignedUrl(doc.storagePath, 300); // 5 minutes validity
    previewUrl = data?.signedUrl || "";
  } else {
    // Return a styled placeholder image using a public generator or data URI
    previewUrl = "https://placehold.co/600x800/18201d/34d399?text=TangLak+Mock+Document+Preview";
  }

  // 2. Load extraction details
  const extraction = await getDocumentExtraction(user.id, documentId);
  const extData = extraction?.normalizedPreview as ExtractedFinancialDocument | null;

  // 3. Search for duplicate candidates from recently confirmed transactions
  let duplicateTransactions: (Transaction & { score: number; reasons: string[] })[] = [];
  const confirmedTxs = await listRecentConfirmedTransactions(user.id);
  
  if (extData?.transaction) {
    const et = extData.transaction;
    const amountVal = et.amount ? Number(et.amount) : 0;
    const tempTx: Transaction = {
      id: "temp",
      userId: user.id,
      type: et.type || "expense",
      status: "draft",
      amountSatang: bahtToSatang(amountVal),
      currency: "THB",
      occurredAt: et.occurredAt || new Date().toISOString(),
      merchant: et.merchant,
      referenceNumber: et.referenceNumber,
      accountLastFour: et.accountLastFour,
      source: "ai_extraction",
    };

    const duplicates = findDuplicateCandidates(tempTx, confirmedTxs);
    duplicateTransactions = duplicates
      .map((cand) => {
        const matchTx = confirmedTxs.find((t) => t.id === cand.transactionId);
        if (!matchTx) return null;
        return {
          ...matchTx,
          score: cand.score,
          reasons: cand.reasons,
        };
      })
      .filter((tx): tx is Transaction & { score: number; reasons: string[] } => tx !== null);
  }

  // 4. Fetch list of active debts for dropdown selection
  const debts = await listDebts(user.id, false);

  return (
    <ReviewForm
      document={doc}
      extraction={extraction}
      debts={debts}
      duplicateTransactions={duplicateTransactions}
      previewUrl={previewUrl}
    />
  );
}
