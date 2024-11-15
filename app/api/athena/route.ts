// app/api/athena/route.ts
import { NextResponse } from 'next/server';
import { Athena } from 'aws-sdk';

export async function GET() {
  const athena = new Athena({
    region: 'us-east-1',
    apiVersion: '2017-05-18'
  });

  try {
    console.log('Starting Athena query process...');
    
    // Test Athena connectivity first
    try {
      const workgroups = await athena.listWorkGroups({}).promise();
      console.log('Workgroups available:', workgroups.WorkGroups?.map(wg => wg.Name));
    } catch (e) {
      console.error('Error listing workgroups:', e);
    }

    // Test database access
    try {
      const databases = await athena.listDatabases({CatalogName: 'AwsDataCatalog'}).promise();
      console.log('Available databases:', databases.DatabaseList?.map(db => db.Name));
    } catch (e) {
      console.error('Error listing databases:', e);
    }

    console.log('Preparing to execute query...');
    const params: Athena.StartQueryExecutionInput = {
      QueryString: 'SELECT * FROM project.gse LIMIT 10',
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

    console.log('Starting query execution with params:', JSON.stringify(params, null, 2));

    const startQueryResponse = await athena.startQueryExecution(params).promise();
    
    if (!startQueryResponse.QueryExecutionId) {
      throw new Error('Failed to get QueryExecutionId');
    }

    const queryExecutionId = startQueryResponse.QueryExecutionId;
    console.log('Query execution started with ID:', queryExecutionId);
    
    let queryStatus: string;
    let statusDetail = '';
    let attempts = 0;
    const maxAttempts = 30; // Maximum number of status check attempts

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
      
      console.log(`Query status check ${attempts + 1}:`, queryStatus, statusDetail ? `(${statusDetail})` : '');

      if (queryStatus === 'FAILED') {
        console.error('Query execution details:', JSON.stringify(queryExecution.QueryExecution, null, 2));
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

    console.log('Query completed, fetching results...');

    const results = await athena
      .getQueryResults({
        QueryExecutionId: queryExecutionId
      })
      .promise();

    console.log('Raw results received:', JSON.stringify(results, null, 2));

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

    console.log(`Successfully processed ${rows.length} rows`);

    return NextResponse.json({ 
      data: rows,
      metadata: {
        queryExecutionId,
        columnCount: headers.length,
        rowCount: rows.length
      }
    });
  } catch (error) {
    console.error('Detailed Athena error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    if (error instanceof Error && 'QueryExecution' in error) {
      const athenaError = error as any;
      console.error('Additional Athena error details:', {
        state: athenaError.QueryExecution?.Status?.State,
        stateChangeReason: athenaError.QueryExecution?.Status?.StateChangeReason,
        queryId: athenaError.QueryExecution?.QueryExecutionId,
        athenaErrorCode: athenaError.AthenaErrorCode,
        errorCode: athenaError.ErrorCode,
        errorType: athenaError.__type
      });
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}