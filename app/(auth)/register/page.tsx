import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth-form";
import { AuthScreen } from "@/app/(auth)/login/page";

export const metadata: Metadata = { title: "註冊" };

export default function RegisterPage() {
  return (
    <AuthScreen title="註冊" lede="電子郵件就是登入帳號。密碼會以 bcrypt 雜湊後保存。">
      <RegisterForm />
    </AuthScreen>
  );
}
