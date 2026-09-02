import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  trustHost: true,
  callbacks: {
    jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        const googleSubject =
          typeof profile?.sub === "string"
            ? profile.sub
            : account.providerAccountId;
        token.googleSubject = googleSubject;
      }
      return token;
    },
  },
});
