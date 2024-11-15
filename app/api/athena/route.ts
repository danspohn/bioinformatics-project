// app/api/athena/route.ts
import { NextResponse } from 'next/server';
import { Athena } from 'aws-sdk';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const offset = parseInt(searchParams.get('offset') || '0');
  
  const athena = new Athena({
    region: 'us-east-1',
    apiVersion: '2017-05-18'
  });

  try {
    console.log('Starting Athena query process...');

    // Modified query to use OFFSET
    const params: Athena.StartQueryExecutionInput = {
      QueryString: `
        SELECT title, submission_date 
        FROM project.gse 
        ORDER BY submission_date DESC
        OFFSET ${offset}
        LIMIT 10 
      `,
      QueryExecutionContext: {
        Database: 'project',
        Catalog: 'AwsDataCatalog'
      },
      WorkGroup: 'primary',
      ResultConfiguration: {
        OutputLocation: 's3://danielspohn-bioinformatics-ms/athena-results/',
        EncryptionConfiguration: {
          EncryptionOption: 'SSE_S3'
        }
      }
    };

    const startQueryResponse = await athena.startQueryExecution(params).promise();
    
    if (!startQueryResponse.QueryExecutionId) {
      throw new Error('Failed to get QueryExecutionId');
    }

    const queryExecutionId = startQueryResponse.QueryExecutionId;
    let queryStatus: string;
    let statusDetail = '';
    let attempts = 0;
    const maxAttempts = 30;

    do {
      const queryExecution = await athena
        .getQueryExecution({
          QueryExecutionId: queryExecutionId
        })
        .promise();

      if (!queryExecution.QueryExecution?.Status?.State) {
        throw new Error('Failed to get query status');
      }

      queryStatus = queryExecution.QueryExecution.Status.State;
      statusDetail = queryExecution.QueryExecution.Status.StateChangeReason || '';

      if (queryStatus === 'FAILED') {
        throw new Error(`Query failed: ${statusDetail}`);
      }
      if (queryStatus === 'CANCELLED') {
        throw new Error(`Query cancelled: ${statusDetail}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      if (attempts >= maxAttempts) {
        throw new Error('Query timed out after 30 seconds');
      }
    } while (queryStatus === 'RUNNING' || queryStatus === 'QUEUED');

    const results = await athena
      .getQueryResults({
        QueryExecutionId: queryExecutionId
      })
      .promise();

    if (!results.ResultSet?.ResultSetMetadata?.ColumnInfo || !results.ResultSet.Rows) {
      throw new Error('Invalid query results format');
    }

    const headers = results.ResultSet.ResultSetMetadata.ColumnInfo.map(
      column => column.Name || ''
    );

    const rows = results.ResultSet.Rows.slice(1).map(row => {
      const rowData: { [key: string]: string } = {};
      if (row.Data) {
        row.Data.forEach((cell, index) => {
          rowData[headers[index]] = cell.VarCharValue || '';
        });
      }
      return rowData;
    });

    // Check if there are more results
    const hasMore = rows.length === 10;

    return NextResponse.json({ 
      data: rows,
      pagination: {
        offset,
        hasMore
      }
    });
  } catch (error) {
    console.error('Detailed Athena error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}