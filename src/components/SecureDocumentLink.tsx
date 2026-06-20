import { useEffect, useState } from "react";
import { getSecureFileUrl } from "@/lib/api";

type Props = {
  filePath: string;
  bucket?: string;
  className?: string;
  children: React.ReactNode;
  download?: string;
};

export function SecureDocumentLink({ filePath, bucket = "booking-documents", className, children, download }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSecureFileUrl(filePath, bucket).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => { active = false; };
  }, [filePath, bucket]);

  if (!url) {
    return <span className={className}>...</span>;
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} download={download}>
      {children}
    </a>
  );
}

export function SecureDocumentImage({
  filePath,
  alt,
  className,
  bucket = "booking-documents",
}: {
  filePath: string;
  alt: string;
  className?: string;
  bucket?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSecureFileUrl(filePath, bucket).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => { active = false; };
  }, [filePath, bucket]);

  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
