"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ConsentFormProps {
  authorizationId: string;
  clientName: string;
  scopes: string[];
  redirectUri: string;
}

export function ConsentForm({
  authorizationId,
  clientName,
  scopes,
  redirectUri,
}: ConsentFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecision(decision: "approve" | "deny") {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/oauth/decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorization_id: authorizationId,
          decision,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Failed to process decision");
        setIsLoading(false);
        return;
      }

      if (data.redirect_to) {
        router.push(data.redirect_to);
      } else {
        setError("No redirect URL provided");
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Authorize Application</CardTitle>
        <CardDescription>
          <span className="font-semibold">{clientName}</span> wants to access
          your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="rounded-md bg-gray-50 p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-700">
            Requested permissions:
          </h3>
          {scopes.length > 0 ? (
            <ul className="space-y-1 text-sm text-gray-600">
              {scopes.map((scope) => (
                <li key={scope}>• {scope}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No specific permissions requested</p>
          )}
        </div>

        <p className="break-all text-xs text-gray-500">
          Will redirect to: {redirectUri}
        </p>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => handleDecision("deny")}
          disabled={isLoading}
        >
          Deny
        </Button>
        <Button
          className="flex-1"
          onClick={() => handleDecision("approve")}
          disabled={isLoading}
        >
          {isLoading ? "Processing..." : "Approve"}
        </Button>
      </CardFooter>
    </Card>
  );
}
