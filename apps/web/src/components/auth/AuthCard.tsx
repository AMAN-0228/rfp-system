/**
 * Centred card layout shared by every public auth screen (FE-1 register,
 * FE-2 login, FE-3 password reset). Wraps the shadcn `Card` primitives in a
 * full-viewport flex container so each route file can focus on its form
 * body without re-implementing the chrome.
 *
 * The viewport wrapper uses `min-h-dvh` (dynamic viewport height) so the
 * card stays centred on mobile browsers whose URL bar resizes the visual
 * viewport.
 */
import { type ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer ? <CardFooter>{footer}</CardFooter> : null}
      </Card>
    </div>
  );
}
