import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authorization_id, decision } = body;

    if (!authorization_id) {
      return NextResponse.json(
        { error: "Missing authorization_id" },
        { status: 400 }
      );
    }

    if (!decision || !["approve", "deny"].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision. Must be 'approve' or 'deny'" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError ?? !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Process the decision
    let result;
    if (decision === "approve") {
      result = await supabase.auth.oauth.approveAuthorization(authorization_id);
    } else {
      result = await supabase.auth.oauth.denyAuthorization(authorization_id);
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ redirect_to: result.data?.redirect_url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
