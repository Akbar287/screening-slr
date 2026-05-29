# AI-Assisted Paper Screening Tool

Aplikasi web yang dirancang khusus untuk membantu peneliti dalam melakukan proses *screening* literatur (Systematic Literature Review / SLR). Aplikasi ini memanfaatkan kecerdasan buatan (AI) untuk mempercepat dan mempermudah evaluasi paper berdasarkan kriteria inklusi dan eksklusi yang telah ditentukan.

## 🚀 Fitur Utama

- **Manajemen Kriteria**: Definisikan *Inclusion Criteria* dan *Exclusion Criteria* sesuai dengan kebutuhan penelitian Anda.
- **Import Referensi**: Mendukung upload file referensi dalam format `.bib` (BibTeX) yang diekspor dari database akademis (Scopus, ScienceDirect, IEEE, dll).
- **AI-Powered Screening**: Otomatisasi evaluasi judul dan abstrak paper menggunakan AI. Sistem akan memberikan rekomendasi *Included* atau *Excluded* beserta justifikasi detail berdasarkan kriteria Anda.
- **Analisis Hasil**: Pantau hasil *screening* secara komprehensif. Review alasan AI meloloskan atau menolak sebuah paper untuk memastikan akurasi dan validitas penelitian.
- **Manajemen Duplikasi**: Identifikasi dan kelola referensi yang duplikat dengan mudah.

## 🛠️ Teknologi yang Digunakan

Aplikasi ini dibangun menggunakan *stack* modern:
- **Framework**: [Next.js](https://nextjs.org) (App Router)
- **Database**: PostgreSQL dengan [Prisma ORM](https://www.prisma.io)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) & [shadcn/ui](https://ui.shadcn.com)
- **Autentikasi**: [NextAuth.js](https://next-auth.js.org)

## 💻 Cara Menjalankan Project (Development)

1. **Persiapan Database**
   Pastikan PostgreSQL sudah berjalan. Konfigurasikan koneksi database di file `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/slr?schema=public"
   ```

2. **Install Dependensi**
   ```bash
   yarn install
   # atau npm install / pnpm install
   ```

3. **Migrasi Database**
   Jalankan migrasi Prisma untuk membuat tabel-tabel yang dibutuhkan:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Jalankan Server Development**
   ```bash
   yarn dev
   # atau npm run dev / pnpm dev
   ```

5. **Akses Aplikasi**
   Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

## 📚 Alur Kerja (Workflow)

1. **Registrasi/Login**: Buat akun atau masuk ke aplikasi.
2. **Setup Kriteria**: Masuk ke menu **Criteria** dan tambahkan kriteria inklusi & eksklusi penelitian Anda.
3. **Upload Referensi**: Masuk ke menu **References** -> **Manage** lalu upload file `.bib` Anda.
4. **Jalankan Screening**: Biarkan AI membaca setiap paper dan membandingkannya dengan kriteria Anda.
5. **Review Hasil**: Buka menu **Analysis Results** untuk melihat keputusan akhir dan justifikasi dari AI.
