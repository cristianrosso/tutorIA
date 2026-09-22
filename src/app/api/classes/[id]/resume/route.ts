import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { resumeGuidedClass } from "@/lib/classroom/guided-class-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requireStudent();
    const { id } = await params;
    return NextResponse.json({ session: await resumeGuidedClass(profile, id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo reanudar la clase.",
      },
      { status: 500 },
    );
  }
}
