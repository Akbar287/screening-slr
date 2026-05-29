import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

type RegisterPayload = {
  nama?: string;
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterPayload;

  const nama = body.nama?.trim() ?? "";
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (username.length < 3) {
    return NextResponse.json(
      { message: "Username minimal 3 karakter." },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { message: "Password minimal 6 karakter." },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { message: "Username sudah digunakan." },
      { status: 409 },
    );
  }

  const hashedPassword = await hashPassword(password);

  await prisma.user.create({
    data: {
      nama: nama.length > 0 ? nama : null,
      username,
      password: hashedPassword,
    },
    select: { id: true },
  });

  return NextResponse.json(
    { message: "Registrasi berhasil." },
    { status: 201 },
  );
}
