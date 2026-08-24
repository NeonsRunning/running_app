"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";

export function FollowButton({
  name,
  block = false,
}: {
  name: string;
  block?: boolean;
}) {
  const [following, setFollowing] = useState(false);
  const { toast } = useToast();
  const t = useT();

  return (
    <Button
      variant={following ? "outline" : "secondary"}
      size="lg"
      block={block}
      aria-pressed={following}
      onClick={() => {
        const next = !following;
        setFollowing(next);
        toast({
          title: next
            ? t("follow.followedTitle")
            : t("follow.unfollowedTitle"),
          body: next
            ? t("follow.followedBody", { name })
            : t("follow.unfollowedBody", { name }),
          tone: next ? "success" : "info",
        });
      }}
    >
      {following ? t("follow.following") : t("follow.follow")}
    </Button>
  );
}
