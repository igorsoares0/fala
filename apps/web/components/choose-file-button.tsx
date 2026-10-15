"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { checkVideoFile, VIDEO_FILE_ACCEPT } from "@/lib/check-video-file";
import { startUpload } from "@/lib/upload-store";

/** Picks a video and uploads it into an existing project (retry after a failure or an interrupted upload). */
export function ChooseFileButton({
  projectId,
  className,
  children,
  onError,
}: {
  projectId: string;
  className: string;
  children: React.ReactNode;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    onError(null);
    const check = await checkVideoFile(file);
    if (!check.ok) return onError(check.error);
    void startUpload(projectId, file, check.mimeType, () => router.refresh());
  }

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_FILE_ACCEPT}
        className="hidden"
        data-testid={`upload-input-${projectId}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onFile(file);
        }}
      />
    </>
  );
}
