// pages/api/athena.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Athena, AWSError } from 'aws-sdk';
import { GetQueryExecutionOutput } from 'aws-sdk/clients/athena';

interface DataRow {
  [key: string]: string;
}

interface ApiResponse {
  data?: DataRow[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const athena = new Athena({
    region: 'us-east-1'
  });

  try {
    const params: Athena.StartQueryExecutionInput = {
      QueryString: 'SELECT * FROM project.gse LIMIT 10',
      QueryExecutionContext: {
        Database: 'project'
      },
      ResultConfiguration: {
        OutputLocation: 's3://YOUR_S3_BUCKET/athena-results/'
      }
    };

    const startQueryResponse = await athena.startQueryExecution(params).promise();
    
    // Make sure queryExecutionId is not undefined
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
      const rowData: DataRow = {};
      if (row.Data) {
        row.Data.forEach((cell, index) => {
          rowData[headers[index]] = cell.VarCharValue || '';
        });
      }
      return rowData;
    });

    res.status(200).json({ data: rows });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
}