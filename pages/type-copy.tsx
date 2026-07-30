import React from 'react';
import Head from 'next/head';
import { TypeCopyWorkspace } from '@/components/type-copy/TypeCopyWorkspace';

export default function TypeCopyPage() {
  return (
    <>
      <Head>
        <title>AI Type Copy | NyaySetu</title>
        <meta
          name="description"
          content="Convert scanned legal documents into editable, review-ready Type Copies with clear unreadable-content placeholders."
        />
      </Head>
      <TypeCopyWorkspace />
    </>
  );
}
