import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { pauseGuidedClass } from "@/lib/classroom/guided-class-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requireStudent();
    const { id } = await params;
    return NextResponse.json({ session: await pauseGuidedClass(profile, id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo pausar la clase.",
      },
      { status: 500 },
    );
  }
}
