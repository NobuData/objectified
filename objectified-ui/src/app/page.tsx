import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@lib/auth/authOptions';
import HomePageContent from '@/app/components/home/HomePageContent';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect('/login');
  }

  const firstName =
    (session.user.name?.split(' ')[0]) ??
    session.user.name ??
    session.user.email?.split('@')[0] ??
    'User';

  return <HomePageContent firstName={firstName} />;
}
