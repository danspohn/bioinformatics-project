// app/api/athena/route.ts
import { NextResponse } from 'next/server';
import { Athena } from 'aws-sdk';

export async function GET() {
  const athena = new Athena({
    region: 'us-east-1'  // Replace with your AWS region
  });

  try {
    const params: Athena.StartQueryExecutionInput = {
      QueryString: 'SELECT * FROM project.gse LIMIT 10',
      QueryExecutionContext: {
        Database: 'project'
      },
      ResultConfiguration: {
        OutputLocation: 's3://danielspohn-bioinformatics-ms/athena-results/'  // Replace with your S3 bucket
      }
    };

    const startQueryResponse = await athena.startQueryExecution(params).promise();
    
    if (!startQueryResponse.QueryExecutionId) {
      throw new Error('Failed to get QueryExecutionId');
    }

    const queryExecutionId = startQueryResponse.QueryExecutionId;
    let queryStatus: string;

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

      if (queryStatus === 'FAILED' || queryStatus === 'CANCELLED') {
        throw new Error(`Query ${queryStatus}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
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

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('Athena query error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}