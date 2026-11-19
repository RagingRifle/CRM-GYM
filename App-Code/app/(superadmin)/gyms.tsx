import React from 'react';
import { SafeAreaWrapper } from '@/components/layout';
import { H4BranchControlHub } from '@/features/superadmin';

export default function GymsScreen() {
  return (
    <SafeAreaWrapper scrollable={false}>
      <H4BranchControlHub />
    </SafeAreaWrapper>
  );
}
