import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { advanceGuidedClass } from "@/lib/classroom/guided-class-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requireStudent();
    const { id } = await params;
    const session = await advanceGuidedClass(profile, id);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo avanzar la clase.",
      },
      { status: 500 },
    );
  }
}
