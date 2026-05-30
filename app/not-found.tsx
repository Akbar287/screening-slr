import { ErrorStateCard } from "@/app/components/error-state-card";

export default function NotFound() {
  return (
    <ErrorStateCard
      code="404"
      title="Halaman Tidak Ditemukan"
      description="URL yang kamu buka tidak tersedia atau sudah dipindahkan. Silakan kembali ke halaman utama untuk melanjutkan."
      showBackButton
    />
  );
}
