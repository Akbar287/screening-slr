import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? "change-this-nextauth-secret",
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = typeof token.id === "string" ? token.id : token.sub;

        if (userId) {
          session.user.id = userId;
        }
      }

      return session;
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password;

        if (!username || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username },
        });

        if (!user) {
          return null;
        }

        const isValidPassword = await verifyPassword(password, user.password);

        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id.toString(),
          name: user.nama ?? user.username,
          image: user.avatar ?? null,
        };
      },
    }),
  ],
};
