import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import type { Metadata } from 'next';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: '헬스케어 심텔리전스 레이더',
  description: '헬스케어 관점 뉴스 센싱 대시보드',
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
